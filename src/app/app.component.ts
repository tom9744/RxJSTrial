import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { animationFrameScheduler, concat, defer, fromEvent, interval, merge, Observable, of } from 'rxjs';
import { 
  first, map, scan, share, startWith, switchMap, takeUntil, takeWhile, withLatestFrom 
} from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  @ViewChild('carousel', { static: true }) carousel!: ElementRef;
  @ViewChild('container', { static: true }) container!: ElementRef;

  backgroundColors = ['lightcoral', 'lightcyan', 'lightgreen', 'lightskyblue', 'lightseagreen'];

  ngOnInit(): void {
    const carousel$ = this.generateCarousel();

    carousel$.subscribe(position => {
      const { nativeElement: containerElem } = this.container;

      containerElem.style.transform = `translateX(${position}px)`;
    });
  }

  private generateAnimation(from: number, to: number, duration: number): Observable<number> {
    // defer 오퍼레이터를 이용하여, Observable 생성 시점 지연
    return defer(() => {
      const scheduler = animationFrameScheduler;
      const startTime = scheduler.now();
      // interval 오퍼레이터의 RxJS 스케줄러 변경 (null → animationFrame) 
      const animationRatio$ = interval(0, scheduler)
        .pipe(
          map(() => (scheduler.now() - startTime) / duration),
          takeWhile(rate => rate < 1),
        );

      // 완료된 Observable에 강제로 Observable<1>을 추가하여 반환
      return concat(animationRatio$, of(1))
        .pipe(
          map(rate => from + (to - from) * rate),
        );
    });
  }

  private generateCarousel() {
    const { nativeElement } = this.carousel;

    // DOM 이벤트를 Observable로 변환
    const start$: Observable<MouseEvent> = fromEvent(nativeElement, 'mousedown');
    const move$: Observable<MouseEvent> = fromEvent(nativeElement, 'mousemove');
    const end$: Observable<MouseEvent> = fromEvent(nativeElement, 'mouseup');
    const size$: Observable<number> = fromEvent(window, 'resize')
      .pipe(
        startWith(0),
        map(_event => (nativeElement as HTMLDivElement).clientWidth),
      );

    // start$에서 방출되는 MouseEvent 형태의 데이터를 pageX 데이터로 변환
    const startPos$ = start$.pipe(
      map(event => event.pageX),
    );
    const movePos$ = move$.pipe(
      map(event => event.pageX),
    );

    // startPos$에서 방출되는 pageX 데이터를 movePos$로 변환
    const drag$ = startPos$.pipe(
      switchMap(startPosition => {
        // movePos$는 end$에서 데이터가 방출되기 전까지 pageX 데이터 방출
        return movePos$.pipe(
          map(movePosition => movePosition - startPosition),
          map(distance => ({ distance, size: null })),
          takeUntil(end$),
        );
      }),
      // Hot Observable로 변환
      share(),
    );

    // drag$에서 방출되는 distance 데이터를 end$로 변환
    const drop$ = drag$.pipe(
      switchMap(distance => {
        return end$.pipe(
          map(_event => distance),
          first(),
        );
      }),
      // size$에서 가장 최근에 방출된 데이터를 포함하여 반환
      withLatestFrom(size$, (drag, size) => {
        return { ...drag, size };
      }),
    );

    return merge(drag$, drop$)
    .pipe(
        // scan 오퍼레이터를 사용하여, 데이터 방출 시 상태 관리 
        scan((store, { distance, size }) => {
          const updateStore = {
            ...store,
            from: -(store.index * store.size) + distance,
          };

          // drag$에서 데이터가 방출되는 경우
          if (size === null) {
            updateStore.to = updateStore.from; 
          }
          // drop$에서 데이터가 방출되는 경우
          else {
            let toBeIndex = store.index;

            // 다음 패널로의 이동 여부 결정
            if (Math.abs(distance) >= 30) {
              toBeIndex = distance < 0
                ? Math.min(toBeIndex + 1, this.backgroundColors.length - 1)
                : Math.max(toBeIndex - 1, 0);
            }

            // 갱신될 상태 값 설정
            updateStore.index = toBeIndex;
            updateStore.to = -(toBeIndex * size);
            updateStore.size = size;
          }

          return { ...store, ...updateStore };
        }, {
          from: 0,
          to: 0,
          index: 0,
          size: 0,
        }),
        // 애니메이션 재생 여부 결정
        switchMap(({ from ,to }) => {
          return from === to
            ? of(to)
            : this.generateAnimation(from, to, 300);
        }),
      );
  }
}
