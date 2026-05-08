import { defineComponent, h } from 'vue';

export const IconTag = defineComponent({
  name: 'IconTag',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M640 128H384L256 384v512c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V384L640 128zm-128 576c-70.7 0-128-57.3-128-128s57.3-128 128-128 128 57.3 128 128-57.3 128-128 128z", "fillRule": "evenodd"})
      ]
    );
  }
});
